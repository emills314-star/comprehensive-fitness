# Work log template

Use this for every user-facing implementation. Hosted deployment fields apply only when deployment is explicitly in scope. Keep the final status honest:

- **Implemented locally:** code and tests are complete locally.
- **Review-ready:** the candidate is ready for its required independent or human review.
- **Approved for publication:** required gates passed and the owner explicitly authorized publication.
- **Deployed:** the intended branch/build was published.
- **Verified on hosted website:** the deployed URL passed the browser flow.
- **Blocked/incomplete:** one of those gates failed or could not be checked.

## Change

- Summary:
- User flow affected:

## Evidence

- Files changed:
- Documentation updated:
- Local validation (tests/lint/build):
- Branch and commit:
- Deployment inspected:
- Hosted URL/deployment identifier:
- Browser viewport/device sizes:
- Exact hosted flow tested:
- Expected result:
- Actual result:
- Console/runtime errors:
- Screenshots or visual evidence:
- Remaining issues:

## Final status

Use the narrowest truthful state: **Implemented locally**, **Review-ready**, **Approved for publication**, **Published**, **Published but not hosted-verified**, or **Blocked/incomplete**. Local implementation and review tasks do not require deployment to be complete. Use **Published** only after the explicitly authorized revision reaches the explicitly authorized destination and all deployment-scoped verification succeeds.
