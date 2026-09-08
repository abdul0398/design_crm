import { z } from "zod";
export const projectIdentity = z.object({
  name: z.string().trim().min(1, "Enter a project name").max(150),
  site: z.string().trim().max(150),
  developer: z.string().trim().max(200),
  window: z.string().trim().max(100),
});
