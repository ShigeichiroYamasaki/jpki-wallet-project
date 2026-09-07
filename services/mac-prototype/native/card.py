#!/usr/bin/env python3
"""Local-only PC/SC probe and opt-in JPKI signing test. Never outputs PIN/cert/signature."""
import ctypes as C
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

LIBRARY = '/Applications/JPKI.app/Contents/Resources/JPKIPKCS11Sign.dylib'
U = C.c_ulong
P = C.c_void_p

class CardError(Exception):
    pass

class ReaderState(C.Structure):
    _pack_ = 1  # macOS PCSC headers explicitly use packed structs
    _fields_ = [('reader', C.c_char_p), ('user', P), ('current', C.c_uint32),
                ('event', C.c_uint32), ('atr_length', C.c_uint32), ('atr', C.c_ubyte * 33)]

def probe():
    pcsc = C.CDLL('/System/Library/Frameworks/PCSC.framework/PCSC')
    context = C.c_int32()
    pcsc.SCardEstablishContext.argtypes = [C.c_uint32, P, P, C.POINTER(C.c_int32)]
    pcsc.SCardEstablishContext.restype = C.c_int32
    result = pcsc.SCardEstablishContext(0, None, None, C.byref(context))
    if result:
        raise CardError('PCSC_UNAVAILABLE')
    try:
        length = C.c_uint32()
        pcsc.SCardListReaders.argtypes = [C.c_int32, P, P, C.POINTER(C.c_uint32)]
        pcsc.SCardListReaders.restype = C.c_int32
        result = pcsc.SCardListReaders(context, None, None, C.byref(length)) & 0xffffffff
        if result == 0x8010002e:
            return {'readers': [], 'code': 'READER_NOT_FOUND', 'jpkiInstalled': Path(LIBRARY).exists()}
        if result or length.value > 65536:
            raise CardError('READER_QUERY_FAILED')
        names = C.create_string_buffer(length.value)
        if pcsc.SCardListReaders(context, None, names, C.byref(length)):
            raise CardError('READER_QUERY_FAILED')
        readers = []
        pcsc.SCardGetStatusChange.argtypes = [C.c_int32, C.c_uint32, C.POINTER(ReaderState), C.c_uint32]
        pcsc.SCardGetStatusChange.restype = C.c_int32
        for name in names.raw.split(b'\0'):
            if not name:
                continue
            state = ReaderState(reader=name)
            rc = pcsc.SCardGetStatusChange(context, 0, C.byref(state), 1)
            readers.append({'name': name.decode('utf-8', errors='replace'),
                            'cardPresent': bool(state.event & 0x20) if rc == 0 else None})
        return {'readers': readers, 'code': 'CARD_PRESENT' if any(r['cardPresent'] for r in readers) else 'CARD_ABSENT',
                'jpkiInstalled': Path(LIBRARY).exists()}
    finally:
        pcsc.SCardReleaseContext(context)

class Attribute(C.Structure):
    _fields_ = [('type', U), ('value', P), ('length', U)]

class Mechanism(C.Structure):
    _fields_ = [('type', U), ('parameter', P), ('length', U)]

class PKCS11:
    def __init__(self):
        if not Path(LIBRARY).is_file():
            raise CardError('JPKI_NOT_INSTALLED')
        self.lib = C.CDLL(LIBRARY)
        # Only published PKCS#11 entry points; no card APDU or vendor internals.
        signatures = {'C_Initialize': [P], 'C_Finalize': [P],
          'C_GetSlotList': [C.c_ubyte, P, C.POINTER(U)],
          'C_OpenSession': [U,U,P,P,C.POINTER(U)], 'C_CloseSession': [U],
          'C_Login': [U,U,P,U], 'C_Logout':[U],
          'C_FindObjectsInit':[U,P,U], 'C_FindObjects':[U,P,U,C.POINTER(U)],
          'C_FindObjectsFinal':[U], 'C_GetAttributeValue':[U,P,U],
          'C_SignInit':[U,C.POINTER(Mechanism),U], 'C_Sign':[U,P,U,P,C.POINTER(U)]}
        # Correct signature for GetAttributeValue includes the object handle.
        signatures['C_GetAttributeValue'] = [U,U,P,U]
        for name,args in signatures.items():
            func = getattr(self.lib,name)
            func.argtypes, func.restype = args,U
    def call(self,name,*args):
        rc = getattr(self.lib,name)(*args)
        if rc:
            raise CardError({0xa0:'PIN_REJECTED',0xa4:'CARD_LOCKED',0x32:'CARD_ABSENT',
              0xe0:'CARD_ABSENT',0x70:'UNSUPPORTED_MECHANISM'}.get(rc,'JPKI_API_FAILED'))
    def find(self, session, cls, label=None):
        values = [U(cls)]
        attrs = [Attribute(0, C.cast(C.pointer(values[0]),P), C.sizeof(U))]
        if label is not None:
            values.append(C.create_string_buffer(label))
            attrs.append(Attribute(3,C.cast(values[-1],P),len(label)))
        template=(Attribute*len(attrs))(*attrs)
        self.call('C_FindObjectsInit',session,template,len(attrs))
        try:
            objects=(U*4)();count=U()
            self.call('C_FindObjects',session,objects,4,C.byref(count))
            if count.value != 1:
                raise CardError('KEY_OR_CERTIFICATE_NOT_UNIQUE')
            return objects[0]
        finally:
            self.call('C_FindObjectsFinal',session)
    def attribute(self,session,obj,kind):
        attr=Attribute(kind,None,0)
        self.call('C_GetAttributeValue',session,obj,C.byref(attr),1)
        if not 0 < attr.length < 16384:
            raise CardError('INVALID_CERTIFICATE_SIZE')
        data=C.create_string_buffer(attr.length)
        attr.value=C.cast(data,P)
        self.call('C_GetAttributeValue',session,obj,C.byref(attr),1)
        return data.raw[:attr.length]

def signing_test(request):
    # Require a fixed locally generated non-contract document and a fresh challenge.
    if set(request) != {'requestId','challenge','expiresAt'} or not re.fullmatch(r'[a-f0-9]{64}',request['challenge']):
        raise CardError('INVALID_LOCAL_REQUEST')
    if not re.fullmatch(r'[a-f0-9]{32}',request['requestId']) or not time.time() < request['expiresAt'] <= time.time()+125:
        raise CardError('EXPIRED_LOCAL_REQUEST')
    state=probe()
    if not any(r['cardPresent'] for r in state['readers']):
        raise CardError(state['code'])
    # Import before prompting so missing dependencies never consume a PIN attempt.
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    api=PKCS11();session=U();initialized=False;logged=False
    try:
        api.call('C_Initialize',None);initialized=True
        count=U()
        api.call('C_GetSlotList',1,None,C.byref(count))
        if count.value != 1:
            raise CardError('SELECT_ONE_CARD')
        slots=(U*count.value)()
        api.call('C_GetSlotList',1,slots,C.byref(count))
        api.call('C_OpenSession',slots[0],4,None,None,C.byref(session))
        # Native macOS dialog: PIN never crosses the HTTP/browser boundary or argv.
        script='''set answer to display dialog "JPKI Wallet ローカル署名試験\\n契約・権利移転ではありません。署名用暗証番号（6〜16桁の英数字）を入力してください。誤入力の自動再試行はしません。" default answer "" with hidden answer buttons {"取消", "試験に署名"} default button "試験に署名" cancel button "取消" with title "JPKI Wallet — このMac内だけの試験" giving up after 90
if gave up of answer then error number -128
return text returned of answer'''
        try:
            prompt=subprocess.run(['/usr/bin/osascript','-e',script],capture_output=True,timeout=95)
        except subprocess.TimeoutExpired:
            raise CardError('TIMEOUT')
        if prompt.returncode:
            raise CardError('USER_CANCELLED')
        pin=bytearray(prompt.stdout.rstrip(b'\r\n'))
        prompt=None
        try:
            if not re.fullmatch(rb'[A-Za-z0-9]{6,16}',pin):
                raise CardError('PIN_FORMAT_INVALID')
            if time.time() >= request['expiresAt']:
                raise CardError('EXPIRED_LOCAL_REQUEST')
            raw=(C.c_ubyte*len(pin)).from_buffer(pin)
            api.call('C_Login',session,1,raw,len(pin));logged=True
        finally:
            pin[:]=b'\0'*len(pin)
        cert_obj=api.find(session,1,b'USERCERT')
        cert=x509.load_der_x509_certificate(api.attribute(session,cert_obj,0x11))
        key=cert.public_key()
        if not isinstance(key,rsa.RSAPublicKey) or key.key_size < 2048:
            raise CardError('UNSUPPORTED_KEY_TYPE')
        private=api.find(session,3)
        document=('JPKI Wallet local test only; no contract or rights transfer.\n'+request['requestId']+'\n'+request['challenge']).encode()
        digest_info=bytes.fromhex('3031300d060960864801650304020105000420')+hashlib.sha256(document).digest()
        mechanism=Mechanism(1,None,0)  # CKM_RSA_PKCS with SHA256 DigestInfo
        api.call('C_SignInit',session,C.byref(mechanism),private)
        data=C.create_string_buffer(digest_info)
        length=U()
        api.call('C_Sign',session,data,len(digest_info),None,C.byref(length))
        if not 0 < length.value <= 1024:
            raise CardError('INVALID_SIGNATURE_SIZE')
        signature=C.create_string_buffer(length.value)
        api.call('C_Sign',session,data,len(digest_info),signature,C.byref(length))
        key.verify(signature.raw[:length.value],document,padding.PKCS1v15(),hashes.SHA256())
        return {'code':'LOCAL_SIGNATURE_VERIFIED','requestId':request['requestId'],
                'signatureVerified':True,'pfVerified':False,'certificateValidity':'not_checked',
                'algorithm':'RSASSA-PKCS1-v1_5/SHA-256','scope':'local-test-only'}
    finally:
        if logged:
            api.lib.C_Logout(session)
        if session.value:
            api.lib.C_CloseSession(session)
        if initialized:
            api.lib.C_Finalize(None)

if __name__=='__main__':
    try:
        if sys.platform!='darwin':
            raise CardError('MAC_ONLY')
        if len(sys.argv)==2 and sys.argv[1]=='probe':
            result=probe()
        elif len(sys.argv)==2 and sys.argv[1]=='sign':
            result=signing_test(json.loads(sys.stdin.read(2048)))
        else:
            raise CardError('INVALID_LOCAL_REQUEST')
        print(json.dumps(result,ensure_ascii=False))
    except CardError as e:
        print(json.dumps({'code':str(e),'signatureVerified':False,'jpkiInstalled':Path(LIBRARY).exists()}))
    except Exception:
        # No SDK exceptions, certificate data, PIN or traceback on stdout/stderr.
        print(json.dumps({'code':'LOCAL_HELPER_FAILED','signatureVerified':False}))
