import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerConfig } from "../server/config.js";
import { createDurableServices } from "./composition.js";

interface MaintenanceIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

const consoleIo: MaintenanceIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export async function runMaintenance(
  command: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  io: MaintenanceIo = consoleIo,
): Promise<number> {
  if (command !== "purge-expired") {
    io.stderr("Usage: maintenance purge-expired");
    return 2;
  }

  let services: ReturnType<typeof createDurableServices> | undefined;
  try {
    services = createDurableServices(loadServerConfig(env));
    const result = await services.workspaces.purgeExpired();
    io.stdout(`Expired workspace purge completed: purged=${result.purged.length} failed=${result.failed.length}`);
    return result.failed.length === 0 ? 0 : 1;
  } catch {
    io.stderr("Expired workspace purge failed.");
    return 1;
  } finally {
    services?.database.close();
  }
}

const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPoint === fileURLToPath(import.meta.url)) {
  process.exitCode = await runMaintenance(process.argv[2]);
}
