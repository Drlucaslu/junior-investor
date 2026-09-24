#!/usr/bin/env bash
# Build the Junior Investor image directly on the Olares One host (no registry needed).
# Run as root in Control Hub > Terminal > Olares, from the folder containing ji-src.tgz.
set -euo pipefail
TAG=${TAG:-ghcr.io/drlucaslu/junior-investor:local}
SRC=${SRC:-$(pwd)/ji-src.tgz}
BK=/root/buildkit/bin
if [ ! -x "$BK/buildctl" ]; then
  V=$(curl -sS https://api.github.com/repos/moby/buildkit/releases/latest | grep -m1 tag_name | cut -d'"' -f4)
  curl -sSL -o /tmp/bk.tgz "https://github.com/moby/buildkit/releases/download/$V/buildkit-$V.linux-amd64.tar.gz"
  mkdir -p /root/buildkit && tar -xzf /tmp/bk.tgz -C /root/buildkit
fi
if ! pgrep -x buildkitd >/dev/null; then
  nohup $BK/buildkitd --oci-worker=false --containerd-worker=true \
    --containerd-worker-addr=/run/containerd/containerd.sock \
    --containerd-worker-namespace=k8s.io >/var/log/buildkitd.log 2>&1 &
  sleep 4
fi
W=$(mktemp -d); tar -xzf "$SRC" -C "$W"
$BK/buildctl build --frontend dockerfile.v0 --local context="$W" --local dockerfile="$W" \
  --output type=image,name="$TAG",unpack=true
ctr -n k8s.io images ls | grep junior-investor
echo "Image ready: $TAG  -> now upload the chart built by deploy/market/build_chart.py (Market > My Olares > Upload custom chart)"
