# Separate instance ownership from platform operations

Arclayer models exactly one transferable **Instance Owner** separately from zero or more individually authenticated **Platform Operators**. Both may receive access to the **Platform Console**, but delegated permissions and audit attribution remain actor-specific; one shared account or one `is_super_admin` authority flag must not represent both ownership and routine operations. This preserves a single governance anchor while avoiding an operational single point of failure and shared credentials.
