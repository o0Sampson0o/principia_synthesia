type Props = React.SVGProps<SVGSVGElement> & {
  /** Rendered height in px. Width follows the mark's 0.8583 aspect ratio. */
  size?: number;
  /** Accessible name. Omit to render the mark as decoration (default). */
  title?: string;
};

/**
 * The Principia Synthesia mark.
 *
 * The bowl is `currentColor`, so it inherits `--foreground` and is correct on light,
 * dark, and every user retheme. The violet ramp is fixed — it is the brand colour.
 *
 * Gradient ids are namespaced per instance so multiple marks on one page don't collide.
 */
export default function PrincipiaMark({ size = 20, title, ...props }: Props) {
  const uid = title ? `ps-${title.replace(/\W+/g, "")}` : "ps";
  const base = `${uid}-base`;
  const sheen = `${uid}-sheen`;
  const arm = `${uid}-arm`;
  const mark = `${uid}-mark`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="38.1 38.68 233.7 272.27"
      height={size}
      width={size * 0.8583}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={base} gradientUnits="userSpaceOnUse" x1="58.04" y1="127.6" x2="130.74" y2="288.19">
          <stop offset="0" stopColor="#3F4582" />
          <stop offset="0.259" stopColor="#6770C3" />
          <stop offset="0.37" stopColor="#707AD0" />
          <stop offset="0.63" stopColor="#6770C0" />
          <stop offset="0.704" stopColor="#6770C1" />
          <stop offset="1" stopColor="#7984DB" />
        </linearGradient>
        <radialGradient
          id={sheen}
          gradientUnits="userSpaceOnUse"
          cx="67.76"
          cy="249.41"
          r="161.83"
          gradientTransform="translate(17.45 0.5) scale(0.7499 1)"
        >
          <stop offset="0" stopColor="#C8D6FF" stopOpacity="0.5" />
          <stop offset="0.133" stopColor="#C8D6FF" stopOpacity="0.476" />
          <stop offset="0.533" stopColor="#C8D6FF" stopOpacity="0.2" />
          <stop offset="0.867" stopColor="#C8D6FF" stopOpacity="0.077" />
          <stop offset="1" stopColor="#C8D6FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={arm} gradientUnits="userSpaceOnUse" x1="121.24" y1="0" x2="190.82" y2="0">
          <stop offset="0" stopColor="#49508B" stopOpacity="0" />
          <stop offset="0.32" stopColor="#49508B" stopOpacity="0.131" />
          <stop offset="0.679" stopColor="#49508B" stopOpacity="0.509" />
          <stop offset="0.852" stopColor="#49508B" stopOpacity="0.736" />
          <stop offset="1" stopColor="#49508B" stopOpacity="0.995" />
        </linearGradient>
        <path
          id={mark}
          d="M 38.1 310.95V163.08A45 45 0 0 1 83.1 118.08H121.24V159.31H170.02A20.8 20.8 0 0 0 190.79 139.64V193.1A45 45 0 0 1 145.82 238.1H121.24V265.95A45 45 0 0 1 76.24 310.95Z"
        />
      </defs>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M 38.1 83.68A45 45 0 0 1 83.1 38.68H172.08A99.72 99.72 0 1 1 172.08 238.1H121.24V265.95A45 45 0 0 1 76.24 310.95H38.1ZM 121.24 118.08H168.12A22.7 22.7 0 0 1 190.79 139.64A20.8 20.8 0 0 1 170.02 159.31H121.24Z"
      />
      <use href={`#${mark}`} fill={`url(#${base})`} />
      <use href={`#${mark}`} fill={`url(#${sheen})`} />
      <use href={`#${mark}`} fill={`url(#${arm})`} />
    </svg>
  );
}
