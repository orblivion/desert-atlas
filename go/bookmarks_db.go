package main

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

type BookmarkId string

type Bookmark struct {
	ID      BookmarkId
	Version int
	Name    string
	Lat     string
	Lng     string
}

func (s *Server) bookmarksDBPath() string {
	return filepath.Join(s.userDataPath(), "bookmarks.db")
}

func (s *Server) initBookmarksDB() error {
	db, err := sqlx.Connect("sqlite", s.bookmarksDBPath())
	if err != nil {
		return err
	}

	_, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS
        bookmarks (
            id VARCHAR PRIMARY KEY,
            version INT,
            name VARCHAR,
            lat VARCHAR, -- TODO - make into a number? for now it's a faithful reproduction of a decimal.
            lng VARCHAR -- TODO - make into a number? for now it's a faithful reproduction of a decimal.
        )
    `)
	if err != nil {
		return err
	}
	s.bookmarksDB = db
	return err
}

// TODO consider - is javascript sending bogus stuff? Hopefully Leaflet is better than that.
func validateLatLng(n string) (f float64, err error) {
	// only digits, `-` and `.`, at least length 1
	if !regexp.MustCompile(`^[0-9.\\-]+$`).MatchString(n) {
		err = fmt.Errorf("empty string or unexpected characters")
		return
	}
	if n[0] == '0' {
		err = fmt.Errorf("leading zero")
		return
	}
	f, err = strconv.ParseFloat(n, 64)

	return
}

func validateLat(lat string) (err error) {
	f, err := validateLatLng(lat)
	if err != nil {
		return err
	}
	if f < -90 || f > 90 {
		err = fmt.Errorf("out of bounds")
	}
	return
}

func validateLng(lng string) (err error) {
	f, err := validateLatLng(lng)
	if err != nil {
		return err
	}
	if f < -180 || f > 180 {
		err = fmt.Errorf("out of bounds")
	}
	return
}

func (s *Server) insertBookmark(name, lat, lng string) (bookmark Bookmark, err error) {
	if name == "" {
		err = fmt.Errorf("missing name")
	} else if err = validateLat(lat); err != nil {
		err = fmt.Errorf("missing, malformed, or invalid lat: %s", err.Error())
	} else if err = validateLng(lng); err != nil {
		err = fmt.Errorf("missing, malformed, or invalid lng: %s", err.Error())
	}

	if err != nil {
		return
	}

	bookmark = Bookmark{
		ID:      BookmarkId(uuid.New().String()),
		Version: 0,
		Name:    name,
		Lat:     lat,
		Lng:     lng,
	}

	_, err = s.bookmarksDB.NamedExec(
		"INSERT INTO bookmarks VALUES (:id, :version, :name, :lat, :lng)",
		&bookmark,
	)

	return
}
