import Image from 'next/image';

export function Brand({ className = '', ...props }) {
  return (
    <a
      href="#top"
      aria-label="Make My Marriage home"
      className="shrink-0"
      {...props}
    >
      <Image
        src="/brand/make-my-marriage-logo.png"
        alt="Make My Marriage"
        width={1600}
        height={545}
        loading="eager"
        className={`h-auto w-48 max-w-full object-contain sm:w-56 ${className}`}
        unoptimized
      />
    </a>
  );
}
