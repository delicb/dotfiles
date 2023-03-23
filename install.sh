#!/bin/sh
# Goal of this is to allow simple script that will bootstrap the environment. 
# While having dotfiles in combination with chezmoi is nice, one still needs
# to install chezmoi and apply the changes and commands for doing so are
# different for different operating systems and linux environments. So, with 
# this script, it should be a single command to quickly bootstrap environment, 
# which is mostly useful in ephemeral environments, like inside docker 
# containers.

# important to use sh (not bash or anything else), since this should work on
# most basic of environments (e.g. in alpine container)

# detect package manager, support apt-get and apk for now
detect_os() {
	if [ -f /etc/os-release ]; then
		. /etc/os-release
		OS=$ID
	else
		echo "unkonwn operating system"
		exit 1
	fi
}

prepare_env() {
	detect_os
	case $OS in
	"alpine")
		apk add curl
		;;
	"debian" | "ubuntu")
		apt update && apt install -y curl
		;;
	*)
		echo "unsupported operating system"
		exit 1
		;;
	esac
}

prepare_env
sh -c "$(curl -fsLS git.io/chezmoi)" -- init --apply delicb
