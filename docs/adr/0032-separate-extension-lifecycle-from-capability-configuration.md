# Separate Extension lifecycle from capability configuration

Extension discovery, installation, trust, compatibility, permissions, dependency impact, upgrade, rollback, and removal belong to one Extensibility Platform Domain whose default product surface is Installed extensions. The Platform Domain that consumes an installed capability owns its business configuration and operation, so Extensibility links to but never duplicates email, identity, AI, storage, or other Provider forms; instance installation also grants neither automatic capability enablement nor Workspace activation.
