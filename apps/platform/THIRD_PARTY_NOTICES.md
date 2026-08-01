# Third-party source donor notice

The Platform Console shell adapts reviewed composition patterns from:

- upstream repository: `https://github.com/satnaing/shadcn-admin`
- reviewed commit: `e16c87f213a5ba5e45964e9b67c792105ec74d26`
- license: MIT
- copyright: Copyright (c) 2024 Sat Naing
- adopted references:
  - `src/components/layout/authenticated-layout.tsx`
  - `src/components/layout/app-sidebar.tsx`
  - `src/components/layout/nav-group.tsx`
  - `src/components/layout/header.tsx`
  - `src/components/theme-switch.tsx`
  - `src/context/theme-provider.tsx`

Only the responsive Sidebar/Header composition, collapsed navigation pattern,
and Light/Dark/Follow-system interaction were adopted. Arclayer does not copy
the donor application, demo data, product models, authentication integration,
navigation data, theme tokens, or component primitives. The implementation is
owned by `apps/platform` and uses `@arclayer/ui`, Lucide, TanStack Router,
i18next, and Arclayer semantic tokens.

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
