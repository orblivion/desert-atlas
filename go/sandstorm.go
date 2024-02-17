package main

import (
	"net/http"
	"strings"
)

type Permission string

const PermissionBookmarks = Permission("bookmarks")
const PermissionDownload = Permission("download")

type Permissions []Permission

func (pp Permissions) Has(hp Permission) bool {
	for _, p := range pp {
		if hp == p {
			return true
		}
	}
	return false
}

func SandstormPermissions(r *http.Request) Permissions {
	if r.Header.Get("X-Local-Development") == "true" {
		return Permissions{PermissionBookmarks, PermissionDownload}
	}
	var ps Permissions
	for _, strPerm := range strings.Split(r.Header.Get("X-Sandstorm-Permissions"), ",") {
		// Why not just add it. If it's invalid it just won't match anything.
		ps = append(ps, Permission(strPerm))
	}
	return ps
}
