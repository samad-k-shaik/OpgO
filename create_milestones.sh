#!/usr/bin/env bash
# Creates OpgO milestones in GitHub. Requires: gh auth login
# Usage: bash create_milestones.sh
set -euo pipefail
REPO="samad-k-shaik/OpgO"

create() {
  gh api "repos/$REPO/milestones" -f title="$1" -f description="$2" >/dev/null
  echo "Created: $1"
}

create "M0 - Validate & protect" "Visit 8-10 hospitals/clinics; talk to 20+ patients; sign 2 pilot MoUs (fee visible, settlement, exclusivity); file OpgO trademark + logo; check employment contract IP clause; NDAs for helpers."
create "M1 - Foundation" "Firebase project (Firestore, Functions, Auth, Hosting); data model: hospitals, doctors, sessions, tokens, patients, family, consent, payments, call logs; WhatsApp Cloud API free test number + webhook."
create "M2 - WhatsApp booking v1" "Greeting + consent/DELETE; recognise returning patient + 'token for whom?'; choose town > hospital > doctor > session (daily limit); issue token with ETA; confirmation as 'OpgO + hospital name'."
create "M3 - Reception & doctor app" "PWA: doctor tabs, Now in room / Next, SEND NEXT TO ROOM, walk-in, arrived/absent/re-join, priority, doctor break/late, search, Mark paid, 10s undo, offline badge + sync, Telugu/EN, end-of-day summary, optional TV display."
create "M4 - Live tracking & paid updates" "Firestore triggers on queue change; ETA = people ahead x avg consult time; WhatsApp updates at 5 and 3 ahead (paid only); doctor delay broadcast; missed turn + no-show rules."
create "M5 - Payments" "Pilot: direct UPI link to PhonePe Business + manual Mark paid. Later: PhonePe PG / Cashfree UPI intent webhook -> auto unlock; automatic refunds; phone-booker WhatsApp/SMS pay link."
create "M6 - Reminder calls" "Registered 1601 service number via Plivo/Exotel; Sarvam Bulbul cached clips (fixed text, numbers 1-300, doctors, rooms); call at 2 ahead for paid tokens; no-answer -> WhatsApp fallback; call logs."
create "M7 - Pilot launch" "Go live at 1 hospital; 15-min staff training + Telugu cheat sheet; track bookings/day, paid %, no-show %, avg wait, cost per booking; fix issues weekly."
create "M8 - Scale" "Missed-call booking; AI voice booking (Sarvam STT + LLM + TTS); onboard more hospitals; OpgO admin (pricing, settlements, refunds, failed calls); GST invoicing."
