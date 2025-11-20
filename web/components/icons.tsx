type IconProps = {
  className?: string;
};

export const IconOrg = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path d="M4 21h16" strokeLinecap="round" />
    <path d="M5 10h4v11H5zM10 6h4v15h-4zM15 12h4v9h-4z" />
  </svg>
);

export const IconRepo = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path d="M6 4h12v16H6z" />
    <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
  </svg>
);

export const IconBranch = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path
      d="M6 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm8 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM8 7v10a2 2 0 0 0 2 2h6"
      strokeLinecap="round"
    />
    <path d="M16 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
    <path d="M16 7v4" strokeLinecap="round" />
  </svg>
);

export const IconPlus = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    className={className}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
  </svg>
);

export const IconChevron = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconGhost = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 19v-7a7 7 0 0 1 14 0v7l-2-1-2 1-2-1-2 1-2-1-2 1Z"
    />
    <path d="M10 10h.01M14 10h.01" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

