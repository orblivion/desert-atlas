package main

import (
	"net/http"
	"strings"
)

type Permission string

const HeaderLocalDevelopment = "X-Local-Development"
const HeaderSandstormPermissions = "X-Sandstorm-Permissions"
const HeaderSandstormId = "X-Sandstorm-User-Id"

const PermissionBookmarks = Permission("bookmarks")
const PermissionDownload = Permission("download")

type Permissions []Permission

type SandstormId string

func IsLocalDev(r *http.Request) bool {
	return r.Header.Get(HeaderLocalDevelopment) == "true"
}

func GetSandstormId(r *http.Request) *SandstormId {
	sid := SandstormId(r.Header.Get(HeaderSandstormId))
	if sid != "" {
		return &sid
	}
	return nil
}

func (pp Permissions) Has(hp Permission) bool {
	for _, p := range pp {
		if hp == p {
			return true
		}
	}
	return false
}

func SandstormPermissions(r *http.Request) Permissions {
	if IsLocalDev(r) {
		return Permissions{PermissionBookmarks, PermissionDownload}
	}
	var ps Permissions
	for _, strPerm := range strings.Split(r.Header.Get(HeaderSandstormPermissions), ",") {
		// Why not just add it. If it's invalid it just won't match anything.
		ps = append(ps, Permission(strPerm))
	}
	return ps
}

func GetUniqueId(r *http.Request) *SandstormId {
	if IsLocalDev(r) {
		return nil
	}
	// Anon can't persist identity even through a page load,
	// so we're giving up on saving tutorial modes for them.
	return GetSandstormId(r)
}
