/** A reserved page over the persistent scene; content will be added separately. */
export function FrostedSurface({ name }: { readonly name: "Asset" | "Extension" }) {
  return <main className="demo-frosted-surface" aria-label={name} />;
}
