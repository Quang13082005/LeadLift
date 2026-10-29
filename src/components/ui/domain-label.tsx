import { Fragment } from "react";

export function DomainLabel({ domain }: { domain: string }) {
  return (
    <span className="domain-link-label">
      {domain.split(".").map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {index > 0 && <><span>.</span><wbr /></>}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
