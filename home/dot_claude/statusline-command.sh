#!/bin/sh
input=$(cat)

dir=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
branch=$(git -C "$dir" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
model=$(echo "$input" | jq -r '.model.display_name')
time=$(date +"%H:%M")
remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')

left=""
left="$left\033[48;5;236m\033[38;5;39m  $(basename "$dir") \033[0m"
[ -n "$branch" ] && left="$left\033[48;5;236m\033[38;5;76m  $branch \033[0m"

right=""
[ -n "$remaining" ] && right="\033[48;5;236m\033[38;5;244m ctx:${remaining}% \033[0m "
right="$right\033[48;5;236m\033[38;5;75m  $model \033[0m"
right="$right\033[48;5;236m\033[38;5;75m  $time \033[0m"

printf "%b  %b\n" "$left" "$right"
