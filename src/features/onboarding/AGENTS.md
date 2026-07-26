# Onboarding

- First-run onboarding starts directly at `s1` theme selection. The former timed `s0` brand splash is intentionally not rendered.
- The app-level workspace/resource loading state in `src/client/App.tsx` is separate from onboarding and must continue to reflect real bootstrap readiness.
- S1-S3 share the page-level `BrandBanner`; individual screens do not render their own compact logo block.
- The red `鸿运当头` card is a selectable preview only; it remains outside `ThemeId` and disables S1 continuation while focused.
