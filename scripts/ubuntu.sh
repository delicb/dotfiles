set -o errexit -o nounset

prepare() {
	apt update
	TZ=UTC
	ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

	DEBIAN_FRONTEND=noninteractive
	apt install -y software-properties-common curl gnupg

	apt-add-repository -y ppa:fish-shell/release-3
	apt update
}

install_pkg() {
	apt install -y $@
}
