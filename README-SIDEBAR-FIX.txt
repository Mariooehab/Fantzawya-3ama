SIDEBAR SCROLL FIX

The desktop/tablet sidebar now keeps the account/logout section visible at the bottom.
The navigation list itself (.side-nav) scrolls vertically when its links exceed the available height.
This works across desktop and tablet heights instead of relying on tablet-only duplicate CSS overrides.

Files changed:
- style.css: shared sidebar flex sizing and independent navigation scrolling; removed overlapping tablet-only sidebar scroll overrides.

No Firebase configuration, app features, or authentication logic was intentionally changed.
