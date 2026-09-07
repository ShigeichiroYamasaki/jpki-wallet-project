#!/usr/bin/env bash
set -euo pipefail
# Default is plan-only. Never infer a project from the active gcloud configuration.
: "${GCP_PROJECT_ID:?Set the intended project ID explicitly}"
region=us-west1
zone=us-west1-b
network=jw-prototype
subnet=jw-prototype-west
instance=jw-prototype
mode="${1:---plan}"
if [[ "$mode" != --plan && "$mode" != --apply ]]; then
  echo 'Usage: GCP_PROJECT_ID=... bash infra/gcp/create-private-vm.sh [--plan|--apply]' >&2
  exit 2
fi
if [[ "$mode" == --apply && "${FREE_TIER_REVIEWED:-}" != yes ]]; then
  echo 'Confirm billing-account free-tier usage and set FREE_TIER_REVIEWED=yes.' >&2
  exit 2
fi
run() {
  if [[ "$mode" == --plan ]]; then printf '%q ' "$@"; printf '\n'; else "$@"; fi
}
run gcloud services enable compute.googleapis.com iap.googleapis.com oslogin.googleapis.com --project="$GCP_PROJECT_ID"
run gcloud compute networks create "$network" --subnet-mode=custom --project="$GCP_PROJECT_ID"
run gcloud compute networks subnets create "$subnet" --network="$network" --region="$region" --range=10.72.0.0/24 --enable-private-ip-google-access --project="$GCP_PROJECT_ID"
run gcloud compute firewall-rules create jw-iap-ssh --network="$network" --direction=INGRESS --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=jw-iap --project="$GCP_PROJECT_ID"
run gcloud compute instances create "$instance" --zone="$zone" --machine-type=e2-micro --provisioning-model=STANDARD --subnet="$subnet" --no-address --no-service-account --no-scopes --boot-disk-type=pd-standard --boot-disk-size=30GB --no-boot-disk-auto-delete --image-family=cos-stable --image-project=cos-cloud --metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE --tags=jw-iap --labels=purpose=jw-prototype --shielded-vtpm --shielded-integrity-monitoring --project="$GCP_PROJECT_ID"
