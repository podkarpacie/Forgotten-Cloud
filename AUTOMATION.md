# Automatic Backup Scheduling

Automatic backups use the project’s managed HTTP scheduling service rather than an in-process timer. Each server-owned schedule persists the platform task identifier, and the authenticated callback resolves the target by that identifier rather than caller-supplied payload fields.

The callback only creates an idempotent backup record and audit event in the control plane. A production Forgotten Host Agent remains responsible for producing and retaining the actual server artifact bundle, then reporting completion through the agent integration contract. This separation prevents a web request runtime from starting or supervising game-server processes.

Before enabling schedules for a deployed environment, create a release checkpoint and publish the application; scheduled callbacks target the production service rather than a development preview.
