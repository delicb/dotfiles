set -o errexit -o nounset

prepare() {
	apk update
	apk add tzdata
}

install_pkg() {
	apk add $@
}