interface SectionHeaderProps {
  number?: string;
  title: string;
  className?: string;
}

export default function SectionHeader({ number, title, className = '' }: SectionHeaderProps) {
  return (
    <div className={`font-mono text-[0.625rem] tracking-[0.14em] uppercase text-cs-gray pb-4 border-b border-cs-black mb-10 ${className}`}>
      {number && <span>{number} // </span>}
      {title}
    </div>
  );
}
