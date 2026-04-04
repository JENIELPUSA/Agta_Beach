class ApiFeatures {
  constructor(data, queryString) {
    this.data = data; // Already an array
    this.queryString = queryString;
  }

  filter() {
    if (this.queryString.search) {
      const keyword = this.queryString.search.toLowerCase();
      this.data = this.data.filter(item =>
        item.title?.toLowerCase().includes(keyword) ||
        item.summary?.toLowerCase().includes(keyword) ||
        item.category?.toLowerCase().includes(keyword)
      );
    }
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortField = this.queryString.sort;
      this.data.sort((a, b) => {
        return a[sortField] < b[sortField] ? 1 : -1;
      });
    }
    return this;
  }

  paginate() {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 10;
    const start = (page - 1) * limit;
    const end = page * limit;

    this.data = this.data.slice(start, end);
    return this;
  }

  limitFields() {
    // Optional: if you want to implement field selection
    return this;
  }

  getResult() {
    return this.data;
  }
}

module.exports = ApiFeatures;
