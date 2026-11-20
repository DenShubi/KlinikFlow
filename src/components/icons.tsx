import type { SVGProps } from "react";

// One icon set: 20px grid, 1.75 stroke, round caps and joins.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 10H4M9 5l-5 5 5 5" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6.5V10l2.5 1.5" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.5" cy="7" r="2.75" />
    <path d="M2.5 16c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />
    <path d="M13 4.6a2.75 2.75 0 0 1 0 4.8M14.5 12.3c1.5.5 2.6 1.8 3 3.7" />
  </Icon>
);

export const DoorIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 17V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v13M3 17h14" />
    <path d="M12 10.5v.01" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M13 14l4-4-4-4M17 10H8" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 8l4.5 4.5L14.5 8" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13L5 13.5zM8.25 17.5a1.9 1.9 0 0 0 3.5 0" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6.5v4M10 13.5v.01" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3z" />
  </Icon>
);
