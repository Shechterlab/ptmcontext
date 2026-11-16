from ptmcontext import site as S
import copy
import pathlib

import yaml


def test_compare_minimum_must_be_a_whole_number():
    site = yaml.safe_load((pathlib.Path(__file__).parent.parent / 'sites' / 'methylarginine.yaml').read_text())
    assert site['website']['compare']['min_marks'] == 30 and S.website_problems(site) == []
    bad = copy.deepcopy(site)
    bad['website']['compare']['min_marks'] = 0
    assert any('website.compare.min_marks' in p for p in S.website_problems(bad))
