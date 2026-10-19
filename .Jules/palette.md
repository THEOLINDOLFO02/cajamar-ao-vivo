
## 2024-05-24 - Stateful Button Feedback Without Frameworks
**Learning:** When adding temporary text feedback (like "✅ Copiado!") to buttons in a vanilla JS app, replacing `innerHTML` directly can permanently destroy any icons or formatting inside the button if the user double-clicks before the timeout restores it.
**Action:** Always cache the initial `innerHTML` into a `dataset` attribute (e.g., `btn.dataset.originalHtml = btn.innerHTML`) on the first click, and disable the button while the temporary state is active to prevent race conditions.
