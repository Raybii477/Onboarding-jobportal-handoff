import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      {...props}
    />
  );
}

export const BriefcaseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const KanbanIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v12" />
  </Svg>
);

export const ClipboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    <path d="m9 13 2 2 4-4" />
  </Svg>
);

export const DocIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5M9 13h6M9 17h6" />
  </Svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m5 13 4 4L19 7" />
  </Svg>
);

export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 16V4m0 0 -4 4m4-4 4 4" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Svg>
);

export const RedoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M21 8a9 9 0 1 0 2 6" />
    <path d="M21 3v5h-5" />
  </Svg>
);

export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4-4" />
  </Svg>
);

export const FolderIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Svg>
);

export const HistoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </Svg>
);
