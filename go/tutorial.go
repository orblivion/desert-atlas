package main

// The purpose of this is to reset the user's tutorial mode to intro if the
// permissions change, since there's a different set of instructions
type TutorialType string

const TutorialTypeDownloader = TutorialType("downloader")
const TutorialTypeBookmarker = TutorialType("viewer")
const TutorialTypeViewer = TutorialType("viewer")

func GetTutorialType(pp Permissions) TutorialType {
	switch {
	case pp.Has(PermissionDownload):
		return TutorialTypeDownloader
	case pp.Has(PermissionBookmarks):
		return TutorialTypeBookmarker
	default:
		return TutorialTypeViewer
	}
}
