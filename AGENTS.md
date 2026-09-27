<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Properstar index: agency presence tracked in `properstar_index_state` (7-day Deleted grace after deactivation); agency links signed HMAC-SHA256(OfficeId, PROPERSTAR_INDEX_KEY). Why: Properstar pulls one index URL, deactivation has no reliable timestamp elsewhere.
