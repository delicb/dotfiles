set -o errexit -o nounset

prepare() {
	apt update
	TZ=UTC
	ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

	DEBIAN_FRONTEND=noninteractive
	apt install -y software-properties-common curl gnupg

	echo 'deb http://download.opensuse.org/repositories/shells:/fish:/release:/3/Debian_11/ /' | tee /etc/apt/sources.list.d/shells:fish:release:3.list
	curl -fsSL https://download.opensuse.org/repositories/shells:fish:release:3/Debian_11/Release.key | gpg --dearmor | tee /etc/apt/trusted.gpg.d/shells_fish_release_3.gpg > /dev/null

	apt update
}

install_pkg() {
	apt install -y $@
}
