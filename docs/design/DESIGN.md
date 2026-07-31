---
name: Nexus Enterprise
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf4'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d5e3fd'
  on-surface: '#0d1c2f'
  on-surface-variant: '#45464d'
  inverse-surface: '#233144'
  inverse-on-surface: '#ebf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0d1c2f'
  surface-variant: '#d5e3fd'
  surface-bg: '#F8FAFC'
  border-subtle: '#E2E8F0'
  status-warning: '#F59E0B'
  status-error: '#EF4444'
  candidate-accent: '#818CF8'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 60px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 1.5rem
  margin-mobile: 1rem
  margin-desktop: 2.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style

The design system is engineered for a dual-purpose ecosystem: a high-stakes hiring pipeline and a meticulous onboarding workflow. The brand personality is **authoritative, efficient, and precise**, evoking the reliability of enterprise-grade software while maintaining an approachable interface for external candidates.

The chosen style is **Corporate / Modern**, leaning heavily on systematic clarity. It utilizes a structured hierarchy, ample white space to prevent cognitive overload during data-heavy tasks, and a refined "utilitarian elegance." The aesthetic prioritizes function over decoration, ensuring that every element serves a clear purpose in the candidate's journey or the administrator's workflow.

## Colors

The palette is anchored by **Deep Navy (#0F172A)**, used for primary navigation and high-level headings to establish trust. **Indigo (#6366F1)** serves as the primary action color, providing a vibrant but professional focal point for CTAs. 

**Emerald (#10B981)** is strictly reserved for success states, completed onboarding steps, and "Hire" actions. The background utilizes a very soft grey-white (`#F8FAFC`) to reduce eye strain, while **Slate (#334155)** handles secondary text and UI borders. This high-contrast approach ensures readability across complex data tables and multi-step forms.

## Typography

This design system employs a two-tier typographic strategy. **Plus Jakarta Sans** is used for headlines to provide a modern, slightly geometric warmth that feels welcoming to candidates. **Inter** is utilized for all body copy, labels, and data inputs to leverage its exceptional legibility and systematic "neutral" feel, which is essential for vetting documents and internal dashboards.

For data-dense areas like the hiring pipeline or document review tables, `body-sm` and `label-sm` are the preferred choices to maximize information density without sacrificing clarity.

## Layout & Spacing

The layout follows a **Fixed Grid** model for desktop dashboards to ensure consistent alignment of complex data structures. A 12-column grid is used for the main workspace, typically featuring a 280px fixed left sidebar for navigation and a fluid content area that caps at 1280px.

Spacing follows a strict 4px/8px baseline rhythm. For internal modules (Onboarding/Hiring), use `stack-sm` for related elements (e.g., input and its label) and `stack-md` for separating form sections. The Job Portal (public-facing) uses more generous white space (`stack-lg`) to create a less "cramped" feel for external applicants.

## Elevation & Depth

To maintain an "Enterprise-Grade" feel, the system avoids heavy shadows in favor of **Tonal Layers** and **Low-contrast outlines**. 

1.  **Level 0 (Base):** Used for the main background (`#F8FAFC`).
2.  **Level 1 (Cards):** White surfaces with a 1px border (`#E2E8F0`). No shadow. Used for standard list items and dashboard widgets.
3.  **Level 2 (Active/Hover):** White surfaces with a subtle, diffused shadow (0px 4px 6px -1px rgba(15, 23, 42, 0.1)). Used to indicate interactable cards or active selections.
4.  **Level 3 (Overlay):** Used for modals and dropdowns. Features a more pronounced shadow to separate the element from the dense background UI.

Interactive elements use slight shifts in background color rather than elevation changes to maintain a flat, modern architectural feel.

## Shapes

The design system uses a **Soft (0.25rem)** roundedness approach. This subtle rounding strikes a balance between the "sharp" professional look of legacy enterprise software and the "friendly" aesthetic of modern SaaS. 

- **Standard Elements:** Buttons, inputs, and checkboxes use `rounded` (4px).
- **Large Elements:** Cards and Modals use `rounded-lg` (8px).
- **Status Tags:** Progress indicators and status chips use a higher roundedness (`rounded-xl` or pill-shaped) to distinguish them from functional UI components like buttons.

## Components

### Buttons
Primary buttons use the Indigo background with white text. Secondary buttons use a Slate-600 outline. Ghost buttons are reserved for "Cancel" or "Back" actions to reduce visual noise.

### Inputs & Form Fields
Fields must have explicit labels using `label-md`. Support text (helper or error) should appear below the input using `body-sm`. Focused states should use a 2px Indigo ring.

### Chips & Status Badges
Status badges (e.g., "Pending", "Vetted", "In Review") should use low-saturation background tints of their respective status colors with high-saturation text to ensure readability (e.g., Emerald-50 background with Emerald-700 text for "Hired").

### Data Tables
Tables are the backbone of the onboarding module. They should use a "clean border" style—horizontal dividers only (`#E2E8F0`). Row hovering should trigger a subtle background tint change to `#F1F5F9`.

### Progress Steppers
Essential for the onboarding journey. Steppers should be horizontal on desktop and vertical on mobile, using Emerald for completed steps and Deep Navy for the active step.

### Applicant File Explorer
The reviewer workspace is a two-pane explorer: a 300px folder rail on the left, the selected applicant's documents on the right. The rail is a bordered surface card, not the navy sidebar — it is content, not navigation. Selected folders take the same `#DDE9FF` tint as the active nav item so the two selection models read alike.

Documents are collapsed rows that expand in place; the chevron rotates 90° rather than swapping glyph. File rows sit on the `--bg` tint inside the white card to read as nested content, with the filename as the click target and size/date right-aligned in `body-sm` muted. Superseded versions stay reachable behind a disclosure, rendered at 70% opacity with a strikethrough filename — visibly present, visibly not current.

Below 900px the two panes stack, folder rail first.