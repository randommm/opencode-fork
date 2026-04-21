import { describe, expect, test } from "bun:test"
import { existsSync, rmSync } from "fs"
import path from "path"
import { Global } from "../../src/global"
import { InstallationChannel } from "../../src/installation/version"
import { Database } from "../../src/storage"

describe("Database.Path", () => {
  test("returns database path for the current channel", () => {
    const expected = ["latest", "beta"].includes(InstallationChannel)
      ? path.join(Global.Path.data, "opencode.db")
      : path.join(Global.Path.data, `opencode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
    expect(Database.getChannelPath()).toBe(expected)
  })

  test("rejects concurrent writers for the same database", async () => {
    const cwd = path.join(import.meta.dir, "../..")
    const script = `import { Database } from "./src/storage"; Database.Client(); await Bun.sleep(30000)`
    const owner = Bun.spawn([process.execPath, "--eval", script], {
      cwd,
      env: process.env,
      stdout: "ignore",
      stderr: "pipe",
    })

    for (let i = 0; i < 50 && !existsSync(`${Database.Path}.lock`); i++) {
      await Bun.sleep(20)
    }
    expect(existsSync(`${Database.Path}.lock`)).toBe(true)

    const contender = Bun.spawn([process.execPath, "--eval", script], {
      cwd,
      env: process.env,
      stdout: "ignore",
      stderr: "pipe",
    })

    const stderr = await new Response(contender.stderr).text()

    owner.kill()
    await owner.exited
    rmSync(`${Database.Path}.lock`, { recursive: true, force: true })

    expect(await contender.exited).toBe(1)
    expect(stderr).toContain("OpenCode database is already in use")
  })
})
