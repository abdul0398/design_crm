import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { agencies, type Project } from "./catalog";
export function templateValues(p: Project): Record<string, string> {
  const agency = agencies.find((a) => a.id === p.client.agency)!;
  return {
    project_name: p.name,
    project_location: p.site,
    developer: p.developer,
    total_units: p.units,
    project_information: p.details,
    client_name: p.client.name,
    mobile: p.client.mobile,
    cea: p.client.cea,
    agency_name: agency.name,
    agency_licence: agency.licence,
    agency_address: agency.address,
  };
}
// Parse HTML so saved contact data cannot become markup, event handlers, or script code.
export function renderTemplate(html: string, values: Record<string, string>) {
  const doc = parse(html);
  const replace = (s: string) =>
    s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, key) => values[key] ?? all);
  function walk(node: DefaultTreeAdapterMap["node"], blocked = false) {
    const element = node as DefaultTreeAdapterMap["element"];
    blocked =
      blocked ||
      ["script", "style", "noscript", "iframe", "object"].includes(
        element.tagName,
      );
    if (node.nodeName === "#text" && !blocked) {
      const text = node as DefaultTreeAdapterMap["textNode"];
      text.value = replace(text.value);
    }
    if (element.attrs && !blocked)
      for (const a of element.attrs) {
        if (!a.value.includes("{{")) continue;
        if (/^on/i.test(a.name) || ["style", "srcdoc"].includes(a.name))
          continue;
        const value = replace(a.value);
        if (
          ["href", "src", "action", "formaction", "xlink:href"].includes(a.name)
        ) {
          try {
            if (
              !["http:", "https:", "mailto:", "tel:"].includes(
                new URL(value, "https://template.invalid").protocol,
              )
            )
              continue;
          } catch {
            continue;
          }
        }
        a.value = value;
      }
    if ("childNodes" in node)
      for (const child of node.childNodes) walk(child, blocked);
  }
  walk(doc);
  return serialize(doc);
}
