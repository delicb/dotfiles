set -o errexit -o nounset

maybe_sudo() {
	if [ -z "$CODESPACES" ]; then
		SUDO=
	else
		SUDO="sudo "
	fi
}

prepare() {
	maybe_sudo
	${SUDO}apt update
	TZ=UTC
	${SUDO}ln -snf /usr/share/zoneinfo/$TZ /etc/localtime

	DEBIAN_FRONTEND=noninteractive
	${SUDO}apt install -y software-properties-common curl gnupg

	${SUDO}apt-add-repository -y ppa:fish-shell/release-3
	${SUDO}apt update
}

install_pkg() {
	${SUDO}apt install -y $@
}
