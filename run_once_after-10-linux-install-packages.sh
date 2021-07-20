#!/bin/sh
# {{- if ( eq .chezmoi.os "darwin" ) }}

detect_distribution() {
	if [ -f /etc/os-release ]; then
		. /etc/os-release
		OS=$ID
	else
		echo "unknown linux distribution"
		exit 1
	fi

	case $OS in
	"alpine")
		UPDATE_CACHE_COMMAND="apk update"
		INSTALL_COMMAND="apk add"
		;;
	"ubuntu")
		UPDATE_CACHE_COMMAND="apt update"
		INSTALL_COMMAND="apt install -y"
		;;
	*)
		echo "unsupported linux distribution $OS"
		exit 1
	esac
}

install_packages() {
	detect_distribution

	# update cache
	$UPDATE_CACHE_COMMAND

	# packages to install
	packages="
	bat
	ripgrep
	direnv
	git
	jq
	zsh
	vim
	wget
	"
	for pkg in $packages; do
		$INSTALL_COMMAND "$pkg"
	done
}

install_packages

# same for alpine and ubuntu
# ripgrep
# direnv
# git
# jq
# zsh (missing pure)
# vim
# wget


# alpine
# exa
# {{ end }}