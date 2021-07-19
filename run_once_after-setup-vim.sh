#!/bin/sh

# create swp and backup dirs
mkdir -p ~/.vim-swp
mkdir -p ~/.vim-backup

# When content of vimrc changes, run this, since potentially
# new plugins are added. This is achieved with including
# vimrc checksum as part of this files comment
# vimrc hash: {{ include "dot_vimrc" | sha256sum }}
vim +PlugInstall +qall
vim +PlugUpdate +qall

