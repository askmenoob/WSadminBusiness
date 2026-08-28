# WSadmin Business E2E UAT checklist

## Automated technical gate
- [x] WhatsApp provider event is normalized, persisted and linked to customer/inbox.
- [x] AI intent drives deterministic booking services rather than direct database writes.
- [x] Booking conflict and availability rules apply.
- [x] Deposit/full payment abstraction, idempotent webhook reconciliation and refund path work with the test provider.
- [x] Booking confirmation/reminder automation schedules through the reliable outbound queue.
- [x] CRM timeline contains WhatsApp and booking activity.
- [x] MVOC isolation smoke test passes.

Run: `npm run test:e2e-technical:db`.

## Human release gate
1. Open `http://192.168.0.102:15281` and use the UAT tenant.
2. Pair a dedicated WSadmin Business WhatsApp test number; do not use the MVOC session.
3. Configure at least one live AI provider key and verify Malay, English and mixed-language booking requests.
4. Configure an approved payment sandbox/live-test provider adapter and complete a deposit payment.
5. From a real WhatsApp customer number, book, reschedule and cancel; verify dashboard/calendar/CRM synchronization.
6. Verify reminder delivery, human takeover, opt-out/START behavior and no duplicate messages.
7. Verify payment reconciliation/refund and treatment/customer history.
8. Confirm `/opt/wsadmin` MVOC behavior and data are unchanged.

P10-04 may only be marked DONE after this human checklist is signed off.
