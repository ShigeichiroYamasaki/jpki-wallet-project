import importlib.util
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import time
import ctypes as C
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding, utils

spec=importlib.util.spec_from_file_location('card',Path(__file__).parents[1]/'native/card.py')
card=importlib.util.module_from_spec(spec);spec.loader.exec_module(card)

class FakePKCS:
    login_calls=0
    reject=False
    def __init__(self):
        self.lib=SimpleNamespace(C_Logout=lambda *_:None,C_CloseSession=lambda *_:None,C_Finalize=lambda *_:None)
        self.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'synthetic-test')])
        now=datetime.now(timezone.utc)
        self.cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(self.key.public_key()).serial_number(1).not_valid_before(now).not_valid_after(now+timedelta(days=1)).sign(self.key,hashes.SHA256()).public_bytes(serialization.Encoding.DER)
    def call(self,name,*a):
        if name=='C_GetSlotList':
            a[2]._obj.value=1
            if a[1] is not None:a[1][0]=1
        elif name=='C_OpenSession':a[-1]._obj.value=1
        elif name=='C_Login':
            FakePKCS.login_calls+=1
            if FakePKCS.reject:raise card.CardError('PIN_REJECTED')
        elif name=='C_Sign':
            payload=a[1].raw[:a[2]]
            signature=self.key.sign(payload[-32:],padding.PKCS1v15(),utils.Prehashed(hashes.SHA256()))
            a[-1]._obj.value=len(signature)
            if a[-2] is not None:C.memmove(a[-2],signature,len(signature))
    def find(self,*a):return 1
    def attribute(self,*a):return self.cert

class NativeTests(unittest.TestCase):
    def request(self):return {'requestId':'a'*32,'challenge':'b'*64,'expiresAt':time.time()+115}
    def setUp(self):FakePKCS.login_calls=0;FakePKCS.reject=False
    def test_real_crypto_with_synthetic_card_never_exports_certificate_or_pin(self):
        with patch.object(card,'probe',return_value={'readers':[{'cardPresent':True}]}),patch.object(card,'PKCS11',FakePKCS),patch.object(card.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'ABC123\n')):
            result=card.signing_test(self.request())
        self.assertTrue(result['signatureVerified']);self.assertFalse(result['pfVerified'])
        self.assertNotIn('certificate',result);self.assertNotIn('pin',result);self.assertNotIn('signature',result)
        self.assertEqual(FakePKCS.login_calls,1)
    def test_bad_pin_is_never_retried(self):
        FakePKCS.reject=True
        with patch.object(card,'probe',return_value={'readers':[{'cardPresent':True}]}),patch.object(card,'PKCS11',FakePKCS),patch.object(card.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'ABC123\n')):
            with self.assertRaisesRegex(card.CardError,'PIN_REJECTED'):card.signing_test(self.request())
        self.assertEqual(FakePKCS.login_calls,1)
    def test_cancel_never_logs_into_card(self):
        with patch.object(card,'probe',return_value={'readers':[{'cardPresent':True}]}),patch.object(card,'PKCS11',FakePKCS),patch.object(card.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout=b'')):
            with self.assertRaisesRegex(card.CardError,'USER_CANCELLED'):card.signing_test(self.request())
        self.assertEqual(FakePKCS.login_calls,0)
    def test_expiry_precedes_card_access(self):
        r=self.request();r['expiresAt']=time.time()-1
        with patch.object(card,'probe') as probe:
            with self.assertRaisesRegex(card.CardError,'EXPIRED_LOCAL_REQUEST'):card.signing_test(r)
            probe.assert_not_called()

if __name__=='__main__':unittest.main()
