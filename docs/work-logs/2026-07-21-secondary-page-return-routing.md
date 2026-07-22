# Secondary-page return routing

- **Status:** IMPLEMENTED; consolidated PWA/hosted verification pending in the comprehensive audit.
- **Bug:** The one-shot `?view=settings` query used by Privacy and Support return links survived later primary navigation. Reloading a canonical Today or Plan hash could therefore reopen More.
- **Fix:** Canonical tab URLs now consume only recognized app deep-link query fields while preserving unrelated query parameters such as deployment verification markers.
- **Regression:** `tests/ui/secondary-page-return.spec.js` returns through the Settings deep link, navigates to Today, reloads, and verifies Today remains canonical.
- **Docs:** `docs/UI_UX.md` and `docs/ROADMAP.md` reviewed and updated by the comprehensive audit reconciliation.
