type SectionHeadingProps = {
  body: string;
  eyebrow: string;
  title: string;
};

export function SectionHeading({ body, eyebrow, title }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <span className="section-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
