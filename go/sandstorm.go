package main

import (
	"net/http"
	"strings"
)

type Permission string

const HeaderLocalDevelopment = "X-Local-Development"
const HeaderSandstormPermissions = "X-Sandstorm-Permissions"
const HeaderSandstormUserId = "X-Sandstorm-User-Id"

const PermissionBookmarks = Permission("bookmarks")
const PermissionDownload = Permission("download")

type Permissions []Permission

type SandstormUserId string

func GetSandstormUserId(r *http.Request) *SandstormUserId {
	sid := SandstormUserId(r.Header.Get(HeaderSandstormUserId))
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

func (s *Server) SandstormPermissions(r *http.Request) Permissions {
	if s.isLocal {
		return Permissions{PermissionBookmarks, PermissionDownload}
	}
	var ps Permissions
	for _, strPerm := range strings.Split(r.Header.Get(HeaderSandstormPermissions), ",") {
		// Why not just add it. If it's invalid it just won't match anything.
		ps = append(ps, Permission(strPerm))
	}
	return ps
}
