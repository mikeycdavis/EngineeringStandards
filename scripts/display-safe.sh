# Display-safe output for the shell wrappers (ST-48 b). Source this file; it defines functions only.
#
#   display_safe VALUE     print VALUE with every control, format and bidi character escaped, line feed
#                          included, so one field cannot forge a second physical line
#   display_safe_lines     the same for each line of stdin (git output), one escaped line per input line
#
# The escaped set is the one scripts/display-safe.mjs escapes; test/display-safe-wrappers.test.mjs holds
# the two to the same classes. Printable ASCII is returned unchanged, and so is any well-formed UTF-8
# character outside the set. A byte that is not part of a well-formed character is shown as \xNN. This is
# plain bash: the wrappers' contract is Docker and git on the host, and no Node.
display_safe() {
  local s="$1" LC_ALL=C
  case "$s" in
    *[!\ -~]*) ;;
    *) printf '%s' "$s"; return 0 ;;
  esac
  # One byte per element, with no subprocess: under LC_ALL=C each character of $s is one byte, and
  # printf's leading-quote form yields its value (masked, because some versions sign-extend a high byte).
  local -a b=()
  local n=${#s} i=0 c c1 cp len j ok escape oct
  for ((j = 0; j < n; j++)); do
    printf -v c '%d' "'${s:j:1}"
    b[j]=$((c & 255))
  done
  while [ "$i" -lt "$n" ]; do
    c=${b[$i]}
    if [ "$c" -lt 32 ] || [ "$c" -eq 127 ]; then
      case "$c" in
        10) printf '\\n' ;;
        13) printf '\\r' ;;
        9) printf '\\t' ;;
        *) printf '\\u%04x' "$c" ;;
      esac
      i=$((i + 1)); continue
    fi
    if [ "$c" -lt 128 ]; then
      printf -v oct '%03o' "$c"
      printf '%b' "\\0$oct"
      i=$((i + 1)); continue
    fi
    # Width of the UTF-8 sequence this lead byte opens, and its code point, if well formed.
    len=0; cp=0
    if [ "$c" -ge 194 ] && [ "$c" -le 223 ]; then len=2; cp=$((c & 31))
    elif [ "$c" -ge 224 ] && [ "$c" -le 239 ]; then len=3; cp=$((c & 15))
    elif [ "$c" -ge 240 ] && [ "$c" -le 244 ]; then len=4; cp=$((c & 7)); fi
    ok=0
    if [ "$len" -gt 0 ] && [ $((i + len)) -le "$n" ]; then
      ok=1
      for ((j = 1; j < len; j++)); do
        c1=${b[$((i + j))]}
        if [ "$c1" -lt 128 ] || [ "$c1" -gt 191 ]; then ok=0; break; fi
        cp=$(((cp << 6) | (c1 & 63)))
      done
      # Overlong forms and values past U+10FFFF are not well formed.
      if [ "$ok" -eq 1 ]; then
        if [ "$len" -eq 3 ] && [ "$cp" -lt 2048 ]; then ok=0; fi
        if [ "$len" -eq 4 ] && { [ "$cp" -lt 65536 ] || [ "$cp" -gt 1114111 ]; }; then ok=0; fi
      fi
    fi
    if [ "$ok" -eq 0 ]; then
      printf '\\x%02x' "$c"; i=$((i + 1)); continue
    fi
    escape=0
    # U+0080-009F, 00AD, 034F, 061C, 115F, 1160, 17B4, 17B5, 180E, 200B-200F, 2028-202E, 2060-206F, 3164,
    # FE00-FE0F, FEFF, FFF9-FFFC, D800-DFFF, E0000-E007F, E0100-E01EF, as decimal code points.
    if [ "$cp" -le 159 ] || [ "$cp" -eq 173 ] || [ "$cp" -eq 847 ] || [ "$cp" -eq 1564 ] \
      || [ "$cp" -eq 4447 ] || [ "$cp" -eq 4448 ] || [ "$cp" -eq 6068 ] || [ "$cp" -eq 6069 ] || [ "$cp" -eq 6158 ] \
      || { [ "$cp" -ge 8203 ] && [ "$cp" -le 8207 ]; } \
      || { [ "$cp" -ge 8232 ] && [ "$cp" -le 8238 ]; } \
      || { [ "$cp" -ge 8288 ] && [ "$cp" -le 8303 ]; } \
      || [ "$cp" -eq 12644 ] \
      || { [ "$cp" -ge 65024 ] && [ "$cp" -le 65039 ]; } \
      || [ "$cp" -eq 65279 ] \
      || { [ "$cp" -ge 65529 ] && [ "$cp" -le 65532 ]; } \
      || { [ "$cp" -ge 55296 ] && [ "$cp" -le 57343 ]; } \
      || { [ "$cp" -ge 917504 ] && [ "$cp" -le 917631 ]; } \
      || { [ "$cp" -ge 917760 ] && [ "$cp" -le 917999 ]; }; then
      escape=1
    fi
    if [ "$escape" -eq 1 ]; then
      if [ "$cp" -gt 65535 ]; then printf '\\u{%x}' "$cp"; else printf '\\u%04x' "$cp"; fi
    else
      for ((j = 0; j < len; j++)); do
        printf -v oct '%03o' "${b[$((i + j))]}"
        printf '%b' "\\0$oct"
      done
    fi
    i=$((i + len))
  done
}

display_safe_lines() {
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    display_safe "$line"
    printf '\n'
  done
}
