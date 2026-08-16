# Require MFA for Platform Sessions

Arclayer issues a full **Platform Session** only after the **Instance Owner** or a **Platform Operator** completes multi-factor authentication. Initial instance bootstrap creates the Instance Owner but limits the resulting authority to MFA enrollment until enrollment and verification succeed; Product Application sessions remain governed by product authentication policy. Platform MFA recovery is an explicit ownership recovery flow and cannot be implemented as a routine action that another Platform Operator silently disables.
