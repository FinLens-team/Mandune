# Security Policy

## Supported Version

Mandune is in early-stage maintenance. Security fixes are applied to the current `main` branch; older commits, forks, and separately deployed instances are not maintained by this repository.

## Reporting a Vulnerability

Do not open a public issue for vulnerabilities or suspected data exposure.

Email `445714414@qq.com` with the subject `Mandune security report`. Include:

- the affected route, component, or commit;
- a minimal reproduction using fictional data;
- the impact you observed;
- whether credentials or private financial data may have been exposed;
- any temporary mitigation you already tested.

Do not include live credentials, access tokens, real portfolio data, raw account screenshots, or another person's data. If a sensitive artifact is essential, describe it first and wait for a protected transfer method.

You should receive an acknowledgement when the report is read. This project does not promise a fixed response or remediation SLA. Please allow time to reproduce and assess the issue before public disclosure.

## Scope Priorities

Reports are especially useful when they involve:

- workspace authorization or cookie isolation;
- access to another workspace's portfolio, history, or Atlas data;
- credentials entering browser bundles, logs, `/health`, model input, or Agent Cards;
- raw screenshot retention beyond its extraction boundary;
- A2A authentication, request validation, or private-payload rejection;
- archive extraction, release integrity, rollback, or SQLite recovery;
- model output bypassing validation or the fixed financial-risk boundary.

The public demo is not a place to test denial-of-service, credential stuffing, destructive payloads, or broad automated scanning. Use a local instance for proof-of-concept work whenever possible.
