#!/usr/bin/env bash
# Push the treasury's and the team's shares out of every contract that holds them (`sweep()` is permissionless and only
# ever pays the immutable TREASURY/TEAM addresses). Reads what is owed first and skips the empty ones.
#   bash tools/sweep.sh            # read only: what each contract owes
#   bash tools/sweep.sh --send     # sweep everything owed, from the keystore account (a password prompt per send)
# The explicit gas limit is the usual Monad precaution (cold access costs more than forge's estimate).
set -euo pipefail
CAST=${CAST:-~/.foundry/bin/cast}
RPC=${RPC:-https://rpc.monad.xyz}
ACCOUNT=${ACCOUNT:-emogotchi}
declare -a NAMES=(Cat Frok Sahur Thiccums R3tards Emonad Shop FightClub)
declare -a ADDRS=(
  0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5
  0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6
  0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7
  0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec
  0x41841b6F2F1750AB32C86C25aB2816F4996bf41e
  0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7
  0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91
  0x996b7Af41570a6eAd15d2749B718edD4C138cE06
)
mon() { python3 -c "print(f'{int(\"$1\")/1e18:g} MON')"; }
owed() { $CAST call "$1" "$2()(uint128)" --rpc-url "$RPC" | awk '{print $1}'; }
total_t=0; total_m=0; declare -a TODO=()
for i in "${!ADDRS[@]}"; do
  a=${ADDRS[$i]}; n=${NAMES[$i]}
  m=$(owed "$a" teamOwed)
  if [ "$n" = FightClub ]; then t=0; else t=$(owed "$a" treasuryOwed); fi
  printf '%-10s treasury %-14s team %s\n' "$n" "$(mon "$t")" "$(mon "$m")"
  total_t=$(python3 -c "print($total_t + $t)"); total_m=$(python3 -c "print($total_m + $m)")   # past bash's 64-bit
  if [ "$t" != 0 ] || [ "$m" != 0 ]; then TODO+=("$a"); fi
done
printf '%-10s treasury %-14s team %s\n' TOTAL "$(mon "$total_t")" "$(mon "$total_m")"
if [ "${1:-}" != "--send" ]; then echo "(add --send to sweep)"; exit 0; fi
for a in "${TODO[@]}"; do
  echo "sweep $a"
  $CAST send "$a" 'sweep()' --rpc-url "$RPC" --account "$ACCOUNT" --gas-limit 150000
done
