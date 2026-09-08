// Project and agency facts preserved from the supplied prototype; not independently verified.
export const projects = [
  {
    id: "amberwood",
    name: "Amberwood at Holland",
    site: "Holland Link",
    developer: "Sim Lian",
    window: "Preview 11 Sep 2026",
  },
  {
    id: "lucerne",
    name: "Lucerne Grand",
    site: "Lakeside Drive",
    developer: "CDL",
    window: "Preview 18 Sep 2026",
  },
  {
    id: "serra",
    name: "The Serra Residences",
    site: "7 Bassein Road",
    developer: "Transurban",
    window: "Preview 19 Sep 2026",
  },
  {
    id: "thomson",
    name: "Thomson Reserve",
    site: "Bright Hill Drive",
    developer: "UOL · CapitaLand · SingLand",
    window: "Preview 3 Oct 2026",
  },
  {
    id: "solano",
    name: "Solano Grand",
    site: "Senja Close EC",
    developer: "CDL",
    window: "Upcoming · Date TBC",
  },
  {
    id: "wynwood",
    name: "Wynwood Grand",
    site: "Woodlands Drive 17 EC",
    developer: "CDL",
    window: "Upcoming · Date TBC",
  },
  {
    id: "island",
    name: "Island Residence",
    site: "Keppel Bay Plot 6",
    developer: "Keppel Land",
    window: "Launch date TBC",
  },
  {
    id: "dunearn",
    name: "Dunearn House",
    site: "760–770 Dunearn Road",
    developer: "Frasers Property · CSC Land",
    window: "Launched 25 Jul 2026",
  },
];
export const emptyClient = { name: "", mobile: "", cea: "", agency: "ERA" };
export type Project = (typeof projects)[number] & {
  updated: string;
};
export type Entry = { path: string; size: number };
export type Design = {
  id: string;
  project: string;
  name: string;
  format: string;
  url: string;
  status: "Unused" | "Active" | "Suspended";
  revision: number;
  updated: string;
  publishedRevision: number | null;
  published: string | null;
  liveUrl: string | null;
  entryPoint: string | null;
  entries: Entry[];
};
