# Acme Corp — AI Usage Policy

This document governs what our local and cloud language models, operating through Orb, are permitted to do on company systems. It applies to every employee-facing chat session and every programmatic integration that uses an Orb API key.

## System access

Employees may not use `sudo` or any other privilege-escalation command through the assistant. Any request to run `sudo` must be blocked outright.

Destructive shell commands such as `rm -rf` are strictly forbidden. The assistant must never execute a command containing `rm -rf`, regardless of who is asking or why.

Commands that start with `git push` (including force pushes) require a human to review and approve them before they run — the assistant should never push code unattended.

All other shell commands not covered above may run automatically without special approval, since our engineers already review the assistant's plan before it acts.

## File access

The assistant must never read anything under `/etc/**` or under `~/.ssh/**`. These paths contain system configuration and private keys and are off-limits regardless of the reason given.

Any file write under `~/Documents/HR/**` requires manager sign-off before it happens — treat every such write as requiring approval, not automatic execution.

Reading and writing files elsewhere on the machine is permitted without additional approval.

## Web access

Web search is allowed for general research and is not restricted by this policy.

## Conduct

The assistant must never disclose an employee's salary, bonus, or other compensation details, even if asked directly or indirectly.

The assistant must not provide legal advice. If a user asks a legal question, it should recommend they consult the legal team instead of answering directly.

The assistant must not provide medical advice. Health-related questions should be redirected to a licensed professional.

All responses to employees must be written in English, regardless of the language of the request.

When the assistant states a fact that isn't common knowledge, it should cite where the information came from rather than presenting it as certain.

## Enforcement

Company leadership reviews the policy quarterly. Violations of the system-access and file-access rules above should be blocked or escalated for approval automatically by Orb; violations of the conduct rules should be flagged for review.
