import type { JayFile } from "@/lib/jaycode";

export interface CloudProject {
  id: string;
  name: string;
  files: JayFile[];
  updatedAt: string;
}

export interface SaveCloudProject {
  name: string;
  files: JayFile[];
}
