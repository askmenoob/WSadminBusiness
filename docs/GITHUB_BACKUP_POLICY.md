# GitHub Backup Policy

Primary repository: `askmenoob/WSadminBusiness` (user-designated GitHub repository).

Current GitHub visibility is **public**. Secret checks and `.env` exclusion are mandatory before every push. The previous `askmenoob/wsadmin-business` remote may remain configured locally only as a legacy backup; it is not the primary origin.

- `dev`: active development branch; every meaningful completed TODO checkpoint must be committed and pushed.
- `main`: release/baseline branch; promotion only after gates pass.
- Each phase closes with a signed/annotated phase tag where practical and a verified remote SHA.
- Google Sheet TODO columns `GitHub Commit`, `Last Updated`, and `Evidence / Verification` are updated after every checkpoint.
- `.env`, credentials, tokens, private keys and customer data must never be committed.
- A backup is not considered proven until the clean-checkout restore drill in P10-07 passes.
