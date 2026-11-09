#!/usr/bin/env python3
"""Prepare an EmailOctopus import candidate. Does not upload, issue coupons or send."""
import argparse, html, re
from pathlib import Path
from urllib.parse import urlparse

def https(value):
    parsed=urlparse(value)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
        raise argparse.ArgumentTypeError('Use an absolute public HTTPS URL without embedded credentials.')
    if parsed.hostname.endswith(('.invalid','.test','.example')) or parsed.hostname in ('localhost','example.com'):
        raise argparse.ArgumentTypeError('A real destination is required for the import candidate.')
    return value.rstrip('/')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--asset-base',required=True,type=https,help='Public folder containing all seven PNG assets')
    p.add_argument('--tools-url',default='https://sisireimagines.etsy.com',type=https,help='Confirmed tools destination; Etsy until the website launches')
    coupon=p.add_mutually_exclusive_group(required=True)
    coupon.add_argument('--coupon-code',help='Actual approved and created shared coupon; never an unissued proposal')
    coupon.add_argument('--coupon-field',help='Exact configured EmailOctopus field merge tag, only if using contact fields')
    p.add_argument('--output',type=Path,default=Path('circle-tools-welcome.import.html'))
    args=p.parse_args()
    if args.coupon_field and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,49}',args.coupon_field):
        p.error('Coupon field must be a valid single merge-tag identifier.')
    root=Path(__file__).resolve().parent
    text=(root/'circle-tools-welcome.template.html').read_text(encoding='utf-8')
    text=text.replace('@@ASSET_BASE@@',html.escape(args.asset_base,quote=True)).replace('@@TOOLS_URL@@',html.escape(args.tools_url,quote=True)).replace('https://sisireimagines.etsy.com',html.escape(args.tools_url,quote=True))
    if args.coupon_code and not re.fullmatch(r'[A-Z0-9]{3,40}',args.coupon_code):
        p.error('Shared coupon must contain 3–40 uppercase letters or digits.')
    text=text.replace('{{CircleCode}}',html.escape(args.coupon_code) if args.coupon_code else '{{'+args.coupon_field+'}}')
    assert '@@' not in text,'Unresolved build placeholder'
    assert '{{SenderInfo}}' in text and '{{UnsubscribeURL}}' in text and '{{RewardsURL}}' in text
    args.output.write_text(text,encoding='utf-8')
    print(f'Import candidate written: {args.output}. Coupon creation/settings, footer resolution and real inbox rendering still require acceptance. Nothing sent.')

if __name__=='__main__':
    main()
