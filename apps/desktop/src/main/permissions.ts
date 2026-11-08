import type { Session } from "electron";

/** Permissions the project has explicitly enabled (PCP-02). Reset when a project closes. */
const granted = new Set<string>();

export function grantPermission(name: "media-microphone" | "media-camera"): void {
  granted.add(name);
}

export function revokeAllPermissions(): void {
  granted.clear();
}

export function installPermissionPolicy(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(granted.has(`media-${permission}`) || granted.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => granted.has(permission));
}
