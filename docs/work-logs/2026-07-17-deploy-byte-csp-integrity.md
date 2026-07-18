# Deploy-byte CSP integrity remediation

## Status

**IMPLEMENTED:** Hosted verification after the first milestone publication detected that Vercel served LF-normalized `index.html` while the CSP hash had been calculated from a Windows CRLF checkout. Browsers therefore rejected the owned inline application runtime before safety assertions could execute.

## Changes

- Pin HTML working-tree/deployment text to LF in `.gitattributes`.
- Calculate the deployment contract from LF-normalized deploy-equivalent HTML bytes.
- Replace the Vercel CSP source with the exact SHA-256 of the served inline script.
- Correct the architecture description of the now-explicit `vercel.json` deployment contract.

## Verification

- The deployment contract must pass from a Windows checkout.
- The full public and UI release gates must pass on the corrective commit.
- The hosted CSP hash must equal the SHA-256 of the served inline script.
- The focused hosted safety-integrity suite must pass at mobile and desktop widths before this remediation is complete.
